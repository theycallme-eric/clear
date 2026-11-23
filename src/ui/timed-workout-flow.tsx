/**
 * Isolated timed-work proposal: shared presentation/clock, format-specific schedule/results.
 *
 * A3 TASK-103 (F1): on /workout this is the timed blocks' renderer, and its
 * Save log is real. Inside the workout shell the attempt's clock (and an
 * AMRAP's counts) are kept where the format's shipped renderer kept them
 * (`timed-attempt-records.ts`), so a walk away and back or a reload loses
 * nothing; the block reports its observed outcome and its log's effort and
 * entries to the shell through `BlockPanel`, as every renderer does; Save log
 * goes through `timedWorkflows.saveResult`, which the product binds to the
 * shell's one completion path; and a saved row is read back as the saved log
 * (TASK-048). In the gallery nothing is stored: there is no shell session.
 *
 * A3 TASK-104 (F2; TASK-006, C17, C18, R39, R48, R66, R68, R98): the actions
 * are the build's lifecycle on Round 7's controls (`TimedWorkoutActions`).
 * Ready, one primary Start; running, a secondary Pause beside the format's
 * primary Finish or Finish early (`finishLabel`); paused, Resume in Pause's
 * place; ended, nothing. The lead control is one element through Start, Pause
 * and Resume, so focus stays on it, and an Undo finish returns focus to it.
 * Pause, Resume and Finish move the attempt through `timed-lifecycle.ts`
 * (`timed-attempt.ts`) and the pause is kept in the format's record, so a
 * reload while paused comes back paused with the same time left
 * (`timed-attempt-records.ts`). An EMOM ended early says FINISHED EARLY and
 * the minute it was in. The section's Finish ends this block's attempt only;
 * Finish workout stays the shell's.
 *
 * A3 TASK-105 (F3; TASK-012, TASK-013, TASK-014, TASK-032, TASK-046 ladder
 * part, TASK-048): a ladder is one durable attempt, held through its one owner
 * `usePersistedLadder` (`workout-persistence.ts`, TASK-032's
 * `clear.workout-ladders`, under the workout's session, block and attempt):
 *
 *   · **the clock** is the attempt's, raced against the cap stamped when the
 *     attempt was created (its original cap), never re-read from the block; a
 *     ladder clock an older build kept under the For Time key is adopted by the
 *     first action (A3 TASK-104's rule) and the For Time record left alone;
 *   · **live progress** (TASK-013; C34, AC-R013-01): while the clock runs or is
 *     paused, the prescription's rounds are the ordered check-off
 *     (`LadderPrescription`), stored as one number, the rounds completed
 *     through. Finish, or the cap, imports it into the log (C36, AC-R013-03):
 *     every round checked starts Complete, a prefix Incomplete through its last
 *     round, nothing tracked Incomplete with no round stated — never every
 *     round because Finish was pressed, and no planned target becomes an
 *     actual. Only `highest_rung` is recorded (`timedShellOutcome`);
 *   · **the draft** — the answer, the rounds (`LadderCompletion`), each
 *     movement's next-round amount and load, the effort (`SetEffortChoice`) and
 *     the notes — is the attempt's, so it survives closing the log, a reload, a
 *     closed tab and a failed save;
 *   · **Undo finish · resume ladder** (TASK-014; C38, C39, C60): offered in the
 *     log under Complete / Incomplete and before Rounds completed, its text at
 *     the count's left edge (no inherited quiet-button inset), with no
 *     confirmation, while the athlete's Finish can still be undone
 *     (`ladderUndoAvailability`): it brings back the same attempt — running
 *     from the same start, so the time spent finished counts and none is
 *     granted, or paused again at the same moment — with its progress and
 *     draft, and the focus on the lead control. It is withdrawn the moment
 *     undoing would resume at the original cap (re-read each second while it
 *     can run out), the cap itself is never undone, and a saved result ends it;
 *   · **save authority** (TASK-048): the shell's word that the row exists
 *     closes the attempt in the same act (`onBlockRecorded`: this device's own
 *     answered save, or a row known otherwise); a saved ladder shows its row
 *     read back ahead of any local echo, else the draft this device saved,
 *     never a starting point; a refused save is kept on the attempt (`Your log
 *     didn’t save. Try again.`, across reloads) with its draft and Undo for the
 *     retry; and when a row is known while this attempt's own richer save
 *     failed, the block is reopened (`reopenBlock`) so the retry restates it.
 *
 * A scheduled ladder (`scheduled_starts`; TASK-012, TASK-013, TASK-032) is the
 * same durable attempt with no cap (`ladderRaceCapSeconds` gives a schedule
 * none, and none is invented here): its start stamp, its answer, rounds,
 * entries, effort and notes are the attempt's, so a reload, a closed tab and a
 * failed save keep them. Its own clock marks the live round — each round's
 * tile states its start and the live one is `Now` (`Next` before it runs) —
 * so it offers no check-off and nothing to pause or finish: Start schedule is
 * its one action, its interval countdown and status are the schedule's own
 * (`LadderBlock.IntervalCountdown`, `LadderBlock.ScheduleStatus`), and its end is its schedule's,
 * which starts the log at Incomplete with no round (TASK-010). Its log is the
 * same "Log results" dialog, and only `highest_rung` is recorded.
 *
 * A3 TASK-116 (F3; TASK-009, TASK-010, TASK-047, TASK-048) wires the AMRAP's
 * and For Time's results through the same "Log results" dialog:
 *
 *   · **AMRAP scoring** (C25–C28): after the work, `TimedResultLog`'s one
 *     result group of two framed `QuantitySelector` counts — rounds, then reps
 *     into the next round — each blank until tapped, the minus stopping at an
 *     explicit zero, nothing clearing a value; the counts are kept on the
 *     AMRAP's record as they change, blank as `null` and zero as `0`;
 *   · **For Time completion** (C29; R78, R124): "Work completed" — Complete
 *     beside Incomplete — is asked only when the race has a cap. It starts
 *     where the race ended (Finish under the cap at Complete, the cap at
 *     Incomplete; `forTimeCompletion`), and only the athlete's answer is
 *     stored (`workCompleted`, `writeForTimeAnswer`), so a reload brings back
 *     a correction, never the starting point over it; the answer is what
 *     `completed_under_cap` records. With no cap nothing is asked or claimed;
 *   · **effort and notes** (C30; R80): the existing three faces
 *     (`SetEffortChoice`, optional, `null` unanswered) and the notes close the
 *     log; the face is saved as the block's categorical `effort` through the
 *     shell's one completion path, never as a number;
 *   · **save authority** (TASK-AC-8FF68F3F5241, as TASK-105 holds it for the
 *     ladder): the saved row is read back ahead of any local echo; a refused
 *     save — Save log, or the section's forward action — is kept on the
 *     attempt's own record (`writeTimedSaveFailed`), so `Your log didn’t save.
 *     Try again.` is said again after a reload until a save lands; and a row
 *     the shell learns of (`known`) while this attempt's own richer save (its
 *     face or a typed entry) had failed reopens the block (`reopenBlock`), so
 *     the forward action restates it. The draft — counts, answer, face, notes
 *     — survives closing and reopening the log and a failed save.
 *
 * A3 TASK-117 (F3; TASK-011, TASK-015, TASK-046, TASK-047, TASK-048) wires the
 * EMOM's end log and every family's per-movement entries through the same
 * dialog:
 *
 *   · **the EMOM's end log** (C31, C32; R40, R43, R84): once the schedule has
 *     run, or was finished early, the one "Log results" dialog holds
 *     `TimedResultLog`'s EMOM family — no minutes counter, no completion
 *     question, each loaded movement's actual load (no amount: the schedule is
 *     assumed), the effort faces and the notes, where an exception is written.
 *     The note is saved as the block's notes through the shell's one
 *     completion path; `minutes_completed` stays null and the clock's record is
 *     never rewritten by it. While the block's own rest window runs, the clock
 *     says so (`· Rest`) beside its minute, and the next minute's movement is
 *     marked Next; Round 7 still draws no Not started or Work caption;
 *   · **per-movement entries** (C37; TASK-AC-339D1096F660): each movement's
 *     next-round amount and actual load are written onto the attempt's own
 *     record as typed (`writeTimedMovements`: the AMRAP's, the For Time's and
 *     the EMOM's, whose entries are loads only; the ladder's are its durable
 *     draft's) and restored with it, so a reload brings them back; the log
 *     clears the amounts when the round count or the answer moves the round,
 *     and keeps the loads;
 *   · **save authority for the EMOM** (TASK-AC-D58939F8E091): as for the AMRAP
 *     and For Time — a refused save is kept on the EMOM's record, a known row
 *     while this attempt's own richer save had failed reopens the block, and
 *     the saved row is read back ahead of the local echo;
 *   · **the one Log results action** (TASK-046): every family's card offers it
 *     once its attempt has ended, says whether its dialog is open
 *     (`aria-expanded`), and the draft survives closing, reopening and a
 *     failed save.
 *
 * Neither Finish nor Undo completes or leaves the workout. In the gallery the
 * same attempt lives in memory only.
 */
import { use, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { Button, Check, Pause, Play, Stop } from '../design-system/index'
import { movementEntryBlank } from '../data/refinement-logging-rules'
import { useBlockCompletion, type BlockRecordedSource } from '../state/block-completion'
import { emomShape, emomView, minuteAssignment, scheduledMinuteFor, targetForMinute } from '../state/emom'
import { explicitLadderTiming, ladderRoundPlan, ladderRungs, roundMarker, scheduleView } from '../state/ladder'
import { ladderAttemptView, ladderRaceCapSeconds, type LadderDraft, type LadderDraftPatch } from '../state/ladder-recovery'
import { exerciseName, modalityLabel, targetText } from '../state/prescription'
import { distinctLoadText, equipmentName, loadText } from '../state/review'
import { SetLoggingContext } from '../state/set-logging'
import { activeSeconds, EMPTY_TIMED_ATTEMPT, moveTimedAttempt, timedAttemptFromClock, timedAttemptView, type TimedAttempt } from '../state/timed-attempt'
import { readTimedAttempt, recordTimedAction, writeForTimeAnswer, writeTimedCounts, writeTimedMovements, writeTimedSaveFailed } from '../state/timed-attempt-records'
import { finishLabel, type TimedLifecyclePhase } from '../state/timed-lifecycle'
import { defaultShellStorage, usePersistedLadder } from '../state/workout-persistence'
import { formatElapsed, spokenElapsed, useElapsedSeconds } from '../state/workout-clock'
import type { BlockProgress } from '../state/workout-progress'
import { LoggingOverlay } from './logging-overlay'
import { BlockPanel } from './block-renderers-frame'
import { GroupExerciseCoaching } from './exercise-coaching'
import { LadderBlock, PACING_NOTES, timingSummary } from './ladder-block'
import { LadderPrescription, type LadderRoundContext } from './ladder-rungs'
import { MovementIdentity } from './movement-presentation'
import { TimerFrame } from './workout-chrome'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import { TimedResultLog, type TimedFormat, type TimedResultReceipt, type TimedResultDraft } from './timed-result-log'
import { initialTimedResultDraft, receiptFromRecorded, timedShellOutcome, timedShellReport, type TimedClockReading } from './timed-result-shell'
import { AmrapComparison } from './amrap-block'
import { SET_EFFORT_CHOICES } from './set-effort'
import { useCountdownUrgency } from './countdown-urgency'
import { amrapWindowDeadline, emomMinuteDeadline, NO_DEADLINE, raceCapDeadline } from '../state/countdown-urgency'
import '../styles/timed-workout.css'

/**
 * A session id for a mount with no workout shell (the gallery, a bare test
 * seam). Nothing is stored there; the shell's own provider always names the
 * session, and a ladder's record is read back only under that name.
 */
const UNSCOPED_SESSION = 'unscoped-session'

/** No entry typed yet: one frozen object, so a draft with nothing new is the same draft. */
const NO_ENTRIES: Readonly<Record<string, never>> = Object.freeze({})

/** The ladder's empty result, for a saved ladder whose row is not known here: nothing is claimed. */
const NOTHING_CLAIMED: TimedResultDraft = { completed: null, count: null, highestRung: null, effort: null, notes: '', measurements: NO_ENTRIES }

/**
 * TASK-014 (C39, C60; R130, R141; P04): the quiet Undo's visible text starts at
 * the same left edge as the rounds-completed count beneath it. The small
 * button keeps its own inset (`var(--spacing-300)`, so its focus frame clears
 * the first letter and its box reaches past the text alike on both sides) and
 * its control height; its row gives that inset back outside the box, so no
 * inherited inset is left on the text.
 */
const UNDO_TEXT_START: CSSProperties = { marginInline: 'calc(var(--spacing-300) * -1)' }

/**
 * The ladder's durable draft as the log's draft. Once the attempt has ended an
 * unanswered draft starts at Incomplete with no round stated (TASK-010) — drawn,
 * never recorded, and never every round.
 */
function logDraftOfLadder(draft: LadderDraft | null, startIncomplete: boolean): TimedResultDraft {
  return {
    completed: draft?.completed ?? (startIncomplete ? false : null),
    count: null,
    highestRung: draft?.highestRung ?? null,
    effort: draft?.effort ?? null,
    notes: draft?.notes ?? '',
    measurements: draft?.movements ?? NO_ENTRIES,
  }
}

/**
 * The change the log made to the ladder's draft, as a patch of the fields it
 * changed. An answer and its rung always travel together, so a tile tapped
 * from the drawn Incomplete states that answer too.
 */
function ladderPatch(shown: TimedResultDraft, next: TimedResultDraft): LadderDraftPatch {
  const answered = next.completed !== shown.completed || next.highestRung !== shown.highestRung
  return {
    ...(answered ? { completed: next.completed, highestRung: next.highestRung } : {}),
    ...(next.effort !== shown.effort ? { effort: next.effort } : {}),
    ...(next.notes !== shown.notes ? { notes: next.notes } : {}),
    ...(next.measurements !== shown.measurements ? { movements: next.measurements } : {}),
  }
}

/** TASK-048: whether the draft holds anything only the richer save writes — a category, or a typed amount or load. */
function richerDraft(draft: LadderDraft | null): boolean {
  if (draft === null) return false
  return draft.effort !== null || Object.values(draft.movements).some((entry) => !movementEntryBlank(entry))
}

/** A3 TASK-116: the same question of an AMRAP's or For Time's log draft. */
function richerLogDraft(draft: TimedResultDraft): boolean {
  return draft.effort !== null || Object.values(draft.measurements).some((entry) => !movementEntryBlank(entry))
}

/** `now` defaults to the wall clock; the gallery passes its own to show capped and final-second states. */
export function TimedWorkoutFlow({ block, format, now = Date.now }: { block: BlockProgress; format: TimedFormat; now?: () => number }) {
  const presentation = useWorkoutExperiencePresentation()
  const options = presentation?.timedWorkflows
  const weightUnit = use(SetLoggingContext)?.weightUnit ?? null
  const completion = useBlockCompletion()
  const timing = explicitLadderTiming(block)
  const rungs = ladderRungs(block.exercises)
  const recordFormat = format === 'ladder' ? null : format
  const isLadder = recordFormat === null
  // A3 TASK-105: a scheduled ladder — the same durable attempt, its rounds moved on by its own clock.
  const schedule = isLadder && timing?.mode === 'scheduled_starts' ? timing : null
  // A3 TASK-103: the shell's session is what makes the attempt worth keeping;
  // a gallery or bare mount has none and stores nothing.
  const [storage] = useState(() => completion.sessionId === undefined ? null : defaultShellStorage())
  const scope = { storage, sessionId: completion.sessionId ?? null }
  // A3 TASK-105: a ladder's one durable attempt (inert, in memory, for every other format).
  const ladderRecorded = isLadder && completion.isBlockRecorded(block.blockId)
  const ladder = usePersistedLadder({
    sessionId: completion.sessionId ?? UNSCOPED_SESSION,
    blockId: block.blockId,
    capSeconds: ladderRaceCapSeconds(block),
    rungCount: rungs.length,
    recorded: ladderRecorded,
    storage: isLadder ? storage : null,
    now,
    adoptLegacyClock: 'on-first-change',
  })
  const cap = isLadder ? ladder.attempt.originalCapSeconds : timing?.mode === 'capped_window' ? timing.cap_seconds : block.timerSeconds
  const [restored] = useState(() => recordFormat === null ? null : readTimedAttempt(scope, recordFormat, block))
  // A3 TASK-116: an AMRAP's and a For Time's save authority, kept on their own records (A3 TASK-117: and an EMOM's).
  const savesOnRecord = recordFormat !== null
  // A3 TASK-117 (TASK-AC-339D1096F660): the per-movement entries the attempt's record kept, as typed.
  const [storedEntries] = useState<TimedResultDraft['measurements']>(() => ({ ...(restored?.movements ?? {}) }))
  // A3 TASK-116 (TASK-010): a For Time race's answer to "Work completed", once the athlete gives it.
  const [answer, setAnswer] = useState<boolean | null>(() => restored?.answer ?? null)
  const [recordSaveFailed, setRecordSaveFailed] = useState(() => restored?.saveFailed ?? false)
  const [ownAttempt, setOwnAttempt] = useState<TimedAttempt>(restored?.attempt ?? EMPTY_TIMED_ATTEMPT)
  const attempt = isLadder ? timedAttemptFromClock(ladder.attempt.clock) : ownAttempt
  const [receipt, setReceipt] = useState<TimedResultReceipt | null>(null)
  const [resultDraft, setResultDraft] = useState<TimedResultDraft | null>(() => {
    const counts = restored?.counts
    if (!counts || (counts.roundsCompleted === null && counts.partialRoundReps === null)) return null
    return { ...initialTimedResultDraft('amrap', false, 0), count: counts.roundsCompleted, partialReps: counts.partialRoundReps, measurements: storedEntries }
  })
  const [editing, setEditing] = useState(false)
  // An attempt that had already ended before this mount does not reopen its log on arrival.
  const [logOpen, setLogOpen] = useState(() => {
    const kept = isLadder ? timedAttemptFromClock(ladder.attempt.clock) : restored?.attempt ?? null
    if (kept === null || kept.startedAt === null) return true
    // A schedule has ended once it has run every round.
    if (schedule !== null) return scheduleView(schedule, ladder.attempt.clock.startedAt, activeSeconds(kept, now())).phase !== 'complete'
    const phase = timedAttemptView(kept, now(), cap).phase
    return phase !== 'finished' && phase !== 'capped'
  })
  const logHost = useRef<HTMLDivElement>(null)
  /** TASK-104: Start, then Pause and Resume, are this one control; Undo finish returns focus to it. */
  const leadRef = useRef<HTMLButtonElement>(null)
  const refocusLead = useRef(false)
  /** The attempt, kept where the format's shipped renderer kept its clock (a ladder's is `ladder`'s). */
  const moveAttempt = (next: TimedAttempt) => {
    setOwnAttempt(next)
    if (recordFormat !== null) recordTimedAction(scope, recordFormat, block, next)
  }
  /**
   * The log's draft; an AMRAP's counts are kept on its record, as the shipped
   * AMRAP kept them, and a For Time's answer on its race once the athlete
   * gives one (A3 TASK-116) — a correction of a saved log keeps neither until
   * it saves.
   */
  const changeDraft = (next: TimedResultDraft) => {
    const shown = resultDraft ?? startDraft
    setResultDraft(next)
    if (format === 'amrap') writeTimedCounts(storage, block, { roundsCompleted: next.count, partialRoundReps: next.partialReps ?? null })
    if (format === 'for_time' && !editing && typeof next.completed === 'boolean' && next.completed !== shown.completed) {
      setAnswer(next.completed)
      writeForTimeAnswer(storage, block, next.completed)
    }
    // A3 TASK-117: the typed entries go onto the attempt's own record as they change (the log already cleared any
    // amount a moved round no longer owns); a correction of a saved log keeps them until it saves.
    if (recordFormat !== null && !editing && next.measurements !== shown.measurements) {
      writeTimedMovements(storage, recordFormat, block, next.measurements)
    }
  }
  /** A3 TASK-116: a refused save of an AMRAP's or For Time's log (A3 TASK-117: or an EMOM's), or one that has since landed, noted on its record. */
  const noteSaveFailed = (failed: boolean) => {
    if (recordFormat === null) return
    setRecordSaveFailed(failed)
    writeTimedSaveFailed(storage, recordFormat, block, failed)
  }
  const adjustedStart = attempt.startedAt === null ? null : new Date(attempt.startedAt + attempt.pausedMs).toISOString()
  const elapsed = activeSeconds(attempt, now())
  const view = timedAttemptView(attempt, (attempt.startedAt ?? 0) + attempt.pausedMs + elapsed * 1000, cap)
  // A schedule's place, read off the attempt's start stamp; null for every other ladder and format.
  const scheduleNow = schedule === null ? null : scheduleView(schedule, ladder.attempt.clock.startedAt, view.elapsed)
  // The hook re-renders the readout each second while the clock runs (a
  // schedule's, until it has run every round); the reading itself is the
  // attempt's at this render, so an Undo finish (which brings back the same
  // start) shows the attempt's own time at once rather than the finished
  // reading until the next tick (A3 TASK-105; AC-R014-03).
  useElapsedSeconds(scheduleNow?.phase === 'complete' ? null : adjustedStart, () => attempt.finishedAt ?? attempt.pausedAt ?? now())
  // A schedule ends with its last interval; every other attempt with Finish or its cap.
  const ended = scheduleNow !== null ? scheduleNow.phase === 'complete' : view.phase === 'finished' || view.phase === 'capped'
  // A schedule's active time is its run, never past its last interval.
  const elapsedSeconds = schedule === null ? view.elapsed : Math.min(view.elapsed, schedule.rounds * schedule.interval_seconds)
  const sheet = Boolean(presentation?.loggingOverlay) || options?.logPresentation === 'sheet'
  const clock: TimedClockReading = { started: view.phase !== 'ready', ended, elapsedSeconds, capReached: view.phase === 'capped' }
  // The ladder's read model: its progress, its draft (tracked progress carried in once ended), Undo and save authority.
  const ladderView = ladderAttemptView(ladder.attempt, { rungCount: rungs.length, now: now(), recorded: ladderRecorded })
  // TASK-014: while an Undo can still run out (a running attempt finished under a cap), re-read the clock each second.
  const undoRunsOut = isLadder && ladderView.undo.available && ladder.attempt.originalCapSeconds !== null
    && ladder.attempt.checkpoint?.pausedAt === null
  useElapsedSeconds(undoRunsOut ? ladder.attempt.clock.startedAt : null, now)
  // TASK-048: once the shell holds the block's row (this device's save, or the
  // performed read after a reload), that row is the saved log shown — ahead of
  // any local echo; a ladder this device saved with no row known here shows the
  // draft it saved, and one saved elsewhere claims nothing.
  // A saved ladder is closed whether or not this device ever started it (a row
  // known from elsewhere): its saved log, and its correction, are offered all the same.
  const ladderClosed = isLadder && ladderView.authority !== 'draft'
  const recorded = ended || ladderClosed ? completion.recordedResult?.(block.blockId) ?? null : null
  const ladderSaved: TimedResultReceipt | null = !ladderClosed ? null : {
    blockId: block.blockId, format, elapsedSeconds, capReached: view.phase === 'capped', weightUnit,
    result: ladderView.authority === 'saved-here' ? logDraftOfLadder(ladderView.draft, false) : NOTHING_CLAIMED,
  }
  const saved = recorded !== null ? receiptFromRecorded(recorded, block, format, clock, weightUnit) : receipt ?? ladderSaved
  const showLog = (ended || ladderClosed) && (saved === null || editing)
  const shape = emomShape(block)
  const minute = emomView({ startedAt: adjustedStart, workDoneMinute: null }, shape, view.elapsed)
  // A3 TASK-116 (TASK-010; `forTimeCompletion`): a race with a cap, once ended,
  // starts where it ended — Finish under the cap at Complete, the cap at
  // Incomplete — and the athlete's own answer wins; with no cap, no claim.
  const askCompletion = format !== 'for_time' || cap !== null
  const startDraft: TimedResultDraft = format === 'for_time'
    ? { ...initialTimedResultDraft('for_time', false, 0), completed: !ended || cap === null ? null : answer ?? view.phase === 'finished', measurements: storedEntries }
    : { ...initialTimedResultDraft(format, view.phase === 'finished', rungs.length), measurements: storedEntries }
  /** The ladder's log draft: the durable draft while unsaved, the correction while a saved log is edited. */
  const ladderShown = logDraftOfLadder(ladderView.draft, ended && ladderView.editable)
  const ladderDraftChange = (next: TimedResultDraft) => {
    const patch = ladderPatch(ladderShown, next)
    if (Object.keys(patch).length > 0) ladder.editDraft(patch)
  }
  const action = (next: 'start' | 'pause' | 'resume' | 'finish') => {
    if (next === 'finish') setLogOpen(true)
    if (isLadder) {
      if (next === 'start') ladder.start()
      else if (next === 'pause') ladder.pause()
      else if (next === 'resume') ladder.resume()
      else ladder.finish()
      return
    }
    moveAttempt(moveTimedAttempt(attempt, next, now()))
  }
  const canUndoFinish = isLadder && ladderView.undo.available && !editing
  const undoFinish = () => {
    if (!canUndoFinish) return
    ladder.undoFinish(); setLogOpen(true)
    refocusLead.current = true
  }

  // TASK-014/TASK-048: the shell's word on the block's row, kept on the ladder's attempt in the same act.
  const latestLadder = useRef(ladder.attempt)
  useEffect(() => { latestLadder.current = ladder.attempt })
  const { onBlockRecorded, onBlockSaveFailed, reopenBlock } = completion
  const { saveSucceeded, saveFailed, markRecorded } = ladder
  useEffect(() => {
    if (!isLadder) return undefined
    return onBlockRecorded?.(block.blockId, (source: BlockRecordedSource) => {
      const current = latestLadder.current
      if (source === 'saved') { saveSucceeded(current.identity.attemptId); return }
      // AC-R032-03: a row that landed while this attempt's own richer save failed is restated, not hidden.
      if (current.save.status === 'failed' && reopenBlock !== undefined && richerDraft(current.draft)) { reopenBlock(block.blockId); return }
      markRecorded()
    })
  }, [isLadder, block.blockId, onBlockRecorded, reopenBlock, saveSucceeded, markRecorded])
  useEffect(() => {
    if (!isLadder) return undefined
    return onBlockSaveFailed?.(block.blockId, () => saveFailed(latestLadder.current.identity.attemptId))
  }, [isLadder, block.blockId, onBlockSaveFailed, saveFailed])

  // A3 TASK-116 (TASK-AC-8FF68F3F5241): the shell's word on an AMRAP's or For Time's row, and on a refused
  // save, kept on its record in the same act — a known row while this attempt's own richer save had
  // failed reopens the block, as the ladder's does.
  const latestLog = useRef({ draft: startDraft, failed: recordSaveFailed, note: noteSaveFailed })
  useEffect(() => { latestLog.current = { draft: resultDraft ?? startDraft, failed: recordSaveFailed, note: noteSaveFailed } })
  useEffect(() => {
    if (!savesOnRecord) return undefined
    return onBlockRecorded?.(block.blockId, (source: BlockRecordedSource) => {
      const current = latestLog.current
      if (source === 'known' && current.failed && reopenBlock !== undefined && richerLogDraft(current.draft)) {
        reopenBlock(block.blockId)
        return
      }
      current.note(false)
    })
  }, [savesOnRecord, block.blockId, onBlockRecorded, reopenBlock])
  useEffect(() => {
    if (!savesOnRecord) return undefined
    return onBlockSaveFailed?.(block.blockId, () => latestLog.current.note(true))
  }, [savesOnRecord, block.blockId, onBlockSaveFailed])

  // Undo finish: the control the athlete left the attempt by is gone; the attempt's lead control takes the focus.
  useEffect(() => {
    if (refocusLead.current && leadRef.current !== null) {
      refocusLead.current = false
      leadRef.current.focus()
    }
  })

  useEffect(() => {
    if (showLog && !sheet) {
      const heading = logHost.current?.querySelector<HTMLElement>('h1,h2,h3,h4,h5,h6')
      if (heading) { heading.tabIndex = -1; heading.focus() }
    }
  }, [showLog, sheet])

  // What the block reports to the shell, in its format's existing contract: the
  // saved log, or else the draft so far — so the section's forward action saves
  // what the athlete entered even when Save log was never pressed (TASK-015).
  const draftNow = isLadder ? (editing && resultDraft !== null ? resultDraft : ladderShown)
    : resultDraft ?? startDraft
  const reported = saved !== null && !editing ? saved.result : draftNow
  const outcome = timedShellOutcome(format, block, reported, clock)
  const timed = timedShellReport(format, block, reported, saved?.weightUnit ?? weightUnit, ended, recorded)
  // A saved ladder is closed (TASK-048): no clock action, even one never started.
  // A running schedule has nothing to pause or finish: every round starts on its clock.
  const lifecycle: TimedLifecyclePhase = ladderClosed ? 'ended'
    : view.phase === 'ready' ? 'ready' : ended || schedule !== null ? 'ended' : view.phase === 'paused' ? 'paused' : 'running'
  // A window the block prescribes can be ended early; a race, a ladder, or a window it does not prescribe is finished.
  const hasWindow = format === 'emom' ? shape.minutes !== null : cap !== null
  const actions = <TimedWorkoutActions phase={lifecycle} placement={format === 'ladder' ? 'top' : 'after-work'}
    startLabel={schedule !== null ? 'Start schedule' : `Start ${format === 'ladder' ? 'ladder' : block.identity.label}`} finishLabel={finishLabel(format, hasWindow)}
    onStart={() => action('start')} onPause={() => action('pause')} onResume={() => action('resume')} onFinish={() => action('finish')}
    leadRef={leadRef} />
  // TASK-006/TASK-011: an EMOM ended before its last minute says so, and the minute it was in; nothing is counted (E01).
  const endedEarly = format === 'emom' && view.phase === 'finished'
  const earlyNote = !endedEarly ? null : shape.minutes === null
    ? `Finished in minute ${minute.minute}. Continue when you are ready.`
    : `Finished early, in minute ${minute.minute} of ${shape.minutes}. Continue when you are ready.`
  const caption = view.phase === 'paused' ? 'Paused' : view.phase === 'capped'
    ? format === 'for_time' || format === 'ladder' ? 'Cap reached' : 'Time complete'
    : view.phase === 'finished' ? endedEarly && shape.minutes !== null ? 'Finished early' : 'Finished'
    // A3 TASK-117 (TASK-011, AC-R011-01): the block's own rest window inside the minute keeps its word beside the minute.
    : format === 'emom' ? `Minute ${minute.minute} of ${shape.minutes ?? '—'}${minute.phase === 'rest' ? ' · Rest' : ''}`
    : format === 'for_time' || format === 'ladder' ? 'Elapsed' : 'Remaining'
  const clockSeconds = format === 'emom' ? ended ? 0 : minute.secondsRemaining
    : format === 'amrap' ? view.remaining ?? view.elapsed : view.elapsed
  // A schedule's interval countdown carries its own warning (`LadderBlock.IntervalCountdown`).
  // A3 TASK-108 (TASK-008): each format's clock warns on its own deadline,
  // through its adapter — an EMOM's minute, an AMRAP's window, a race toward
  // its cap (For Time and the raced ladder) — held while paused, none once ended.
  const urgency = useCountdownUrgency(ended || schedule !== null ? NO_DEADLINE
    : format === 'emom' ? emomMinuteDeadline({ phase: minute.phase, paused: view.phase === 'paused', secondsRemaining: minute.secondsRemaining })
    : format === 'amrap' ? amrapWindowDeadline({ phase: view.phase === 'running' || view.phase === 'paused' ? view.phase : view.phase === 'ready' ? 'ready' : 'complete', capSeconds: cap, remainingSeconds: view.remaining ?? 0 })
    : raceCapDeadline({ phase: view.phase, remainingSeconds: view.remaining }))
  // A schedule's line is its timing's own (`timingSummary`): its rounds and its interval, no cap.
  const summary = schedule !== null ? timingSummary(schedule, block.timerSeconds) : format === 'ladder'
    ? `${rungs.length} rounds${cap === null ? '' : ` · ${formatElapsed(cap)} cap`}`
    : [block.identity.detail, block.identity.repScheme].filter(Boolean).join(' · ')
  // TASK-012 (JOURNEY-012): each scheduled round states its own start, and the live round is marked from the clock.
  const plan = schedule === null ? [] : ladderRoundPlan(block.exercises, schedule)
  const roundContext = scheduleNow === null ? undefined : (number: number): LadderRoundContext | null => {
    const round = plan[number - 1]
    if (round === undefined) return null
    return { marker: roundMarker(round, scheduleNow), detail: round.startSeconds === null ? null : `Starts at ${formatElapsed(round.startSeconds)}` }
  }
  const log = showLog && <TimedResultLog embedded={sheet} block={block} format={format} weightUnit={weightUnit}
    finished={view.phase === 'finished'} hierarchy={options?.logHierarchy} rungEmphasis={options?.rungEmphasis}
    completionAction={canUndoFinish ? <div className="clr-timed-undo" data-timed-undo="" style={UNDO_TEXT_START}>
      <Button type="button" variant="quiet" size="sm" onClick={undoFinish}>Undo finish · resume ladder</Button></div> : undefined}
    saveFailed={!editing && (isLadder ? ladderView.saveFailed : savesOnRecord && recordSaveFailed)}
    askCompletion={askCompletion}
    initial={saved?.result}
    value={isLadder ? (editing && resultDraft !== null ? resultDraft : ladderShown) : resultDraft ?? startDraft}
    onDraftChange={isLadder && !editing ? ladderDraftChange : changeDraft} onSave={async result => {
      const saveResult = options?.saveResult
      if (!saveResult) throw new Error('No result adapter configured')
      const next: TimedResultReceipt = { blockId: block.blockId, format, result, weightUnit: saved?.weightUnit ?? weightUnit,
        elapsedSeconds, capReached: view.phase === 'capped' }
      // A ladder's own save is kept on its attempt: refused, the draft and Undo stay for the retry; answered, the attempt closes.
      const durable = isLadder && !editing
      // A3 TASK-116: an AMRAP's or For Time's own save is kept on its record the same way.
      const onRecord = savesOnRecord && !editing
      try {
        await saveResult(next, { block, shell: completion })
      } catch (error) {
        if (durable) saveFailed()
        if (onRecord) noteSaveFailed(true)
        throw error
      }
      if (durable) saveSucceeded()
      if (onRecord) noteSaveFailed(false)
      setReceipt(next); setEditing(false); setLogOpen(false)
    }} />

  // `data-urgent`: the deadline marker every shipped timed renderer carried, so
  // the shell's coordinated countdowns still find this one (A3 TASK-103).
  return <div className="clr-timed-flow" data-timed-format={format} data-phase={view.phase} data-cap-seconds={cap ?? undefined}
    data-counter-style={options?.counterStyle ?? 'wide'} data-urgent={urgency.urgent ? 'true' : 'false'}>
    {urgency.edge}
    <BlockPanel block={block} completion={{ outcome, timed }} timer={view.phase === 'ready' ? null
      : scheduleNow !== null ? <LadderBlock.IntervalCountdown view={scheduleNow} /> :
      <div className="clr-timed-clock"><TimerFrame label={`${format === 'ladder' ? 'Ladder' : block.identity.label} time`} text={formatElapsed(clockSeconds)}
        spoken={`${caption}. ${spokenElapsed(clockSeconds)}`} caption={caption} size="var(--heading-h2-size)" fullWidth
        low={urgency.low || (view.phase === 'capped' && (format === 'for_time' || format === 'ladder'))} pulse={urgency.urgent ? urgency.loop : undefined} /></div>}>
      {block.exercises.length === 0 ? <BlockPanel.EmptyNote /> : <>
        <p className="clr-text-data-xs clr-timed-meta">{summary}</p>
        {scheduleNow !== null && schedule !== null && <LadderBlock.ScheduleStatus view={scheduleNow} rounds={schedule.rounds} />}
        {format === 'ladder' && actions}
        {/* A ladder scheme with no sequence on any movement: the block is malformed, and saying so is its existing meaning. */}
        {format === 'ladder' && rungs.length === 0 && <BlockPanel.Note>This ladder prescribes no rungs — perform the movements as written.</BlockPanel.Note>}
        {format === 'ladder' ? <LadderPrescription exercises={block.exercises} weightUnit={weightUnit} rounds={timing?.rounds ?? null}
          completedThrough={ladderView.progress} roundContext={roundContext}
          onProgress={schedule === null && ladderView.canTrack && (view.phase === 'running' || view.phase === 'paused') ? ladder.track : undefined} /> : <BlockPanel.MovementList label={`Movements in this ${block.identity.label}`}>
          {block.exercises.map(exercise => {
            const p = exercise.prescription
            const equipment = equipmentName(p.equipment_used)
            const load = p.load_type === null ? null : distinctLoadText(loadText(p.load_type, p.load_value, weightUnit), equipment)
            const scheduled = format === 'emom' ? scheduledMinuteFor(exercise.position, minute, shape) : null
            const detail = format === 'emom' && scheduled !== null
              ? `Min ${scheduled} · ${targetText(p, targetForMinute(p, scheduled, shape.size))}` : targetText(p)
            return <BlockPanel.MovementItem key={exercise.exerciseId}>
              {format === 'emom' && minuteAssignment(exercise.position, shape) !== null
                ? <BlockPanel.Label>{minuteAssignment(exercise.position, shape)}</BlockPanel.Label> : null}
              {format === 'emom' && !ended && exercise.position === minute.activePosition && view.phase !== 'ready'
                ? <BlockPanel.Label>Now</BlockPanel.Label> : null}
              {format === 'emom' && !ended && exercise.position !== minute.activePosition && exercise.position === minute.nextPosition
                ? <BlockPanel.Label>Next</BlockPanel.Label> : null}
              <MovementIdentity name={exerciseName(p.exercise_id)} ordinal={String(exercise.position).padStart(2, '0')}
                prescription={detail} load={load} equipment={equipment} />
            </BlockPanel.MovementItem>
          })}
        </BlockPanel.MovementList>}
        {format !== 'ladder' && actions}
        {/* A schedule's one pacing line (not the removed capped-window paragraph), and its end in words: the clock's, not work performed. */}
        {schedule !== null && <BlockPanel.Note>{PACING_NOTES.scheduled_starts}</BlockPanel.Note>}
        {scheduleNow?.phase === 'complete' && <BlockPanel.Note>The clock has run every scheduled round. Say how the block ended below.</BlockPanel.Note>}
        {earlyNote !== null && <p className="clr-timed-meta" data-timed-ended-early="">{earlyNote}</p>}
        {view.phase === 'running' && format === 'amrap' && <p className="clr-timed-meta">Log when complete</p>}
        {showLog && !sheet && <div ref={logHost}>{log}</div>}
        {showLog && sheet && <>
          <div className="clr-timed-actions"><Button variant="primary" aria-expanded={logOpen} onClick={() => setLogOpen(true)}>Log results</Button>
            {canUndoFinish && <Button variant="secondary" onClick={undoFinish}>Resume ladder</Button>}</div>
          <LoggingOverlay title="Log results" open={logOpen} onClose={() => setLogOpen(false)}>
            {log}
          </LoggingOverlay>
        </>}
        {saved !== null && !editing && <div className="clr-timed-log" data-timed-saved="">
          <div className="clr-timed-saved" role="status"><Check /><p>Log saved</p></div>
          <p className="clr-timed-meta">{formatElapsed(saved.elapsedSeconds)} active time
            {format !== 'amrap' || saved.result.count === null ? '' : ` · ${saved.result.count} rounds`}
            {saved.result.highestRung === null ? '' : ` · ${saved.result.highestRung} rungs`}</p>
          {saved.result.effort === null ? null : <p className="clr-timed-meta">Effort: {SET_EFFORT_CHOICES.find(o => o.value === saved.result.effort)?.label}</p>}
          {block.exercises.map(exercise => {
            const value = saved.result.measurements[exercise.exerciseId]
            if (!value || (value.amount === '' && value.weight === '')) return null
            return <p key={exercise.exerciseId} className="clr-timed-meta">{exerciseName(exercise.prescription.exercise_id)}
              {value.amount === '' ? '' : ` · ${value.amount} ${modalityLabel(exercise.prescription).toLowerCase()}`}
              {value.weight === '' ? '' : ` · ${value.weight} ${saved.weightUnit ?? ''}`}</p>
          })}
          {saved.result.notes.trim() === '' ? null : <p>{saved.result.notes}</p>}
          <Button variant="secondary" onClick={() => { setResultDraft(saved.result); setEditing(true); setLogOpen(true) }}>Edit log</Button>
        </div>}
        {/* The shipped AMRAP's like-for-like score line (OVR-03), kept: it says nothing until rounds are recorded. */}
        {format === 'amrap' && ended && <AmrapComparison block={block} outcome={outcome} />}
        {block.exercises.length === 1 && <GroupExerciseCoaching format={block.identity.format} exercises={block.exercises} />}
      </>}
    </BlockPanel>
  </div>
}

/** Where the slot sits in the card: after the work (C17), or the long ladder's top (R66). */
type TimedActionPlacement = 'after-work' | 'top'

interface TimedWorkoutActionsProps {
  readonly phase: TimedLifecyclePhase
  /** The format's own Start words — `Start EMOM`, `Start ladder`. */
  readonly startLabel: string
  /** The format's own end words (`finishLabel`): `Finish` or `Finish early`. */
  readonly finishLabel: string
  readonly onStart: () => void
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onFinish: () => void
  /** Where the consumer placed the slot; it names the placement, nothing more. */
  readonly placement?: TimedActionPlacement
  /** The lead control — Start, Pause or Resume, one element through every phase. */
  readonly leadRef?: Ref<HTMLButtonElement>
}

/**
 * A3 TASK-104 (TASK-006; C17, C18): one timed block's actions in Round 7's
 * full-width `.clr-timed-actions` row. Ready: the primary Start. Running: a
 * secondary Pause beside the primary Finish or Finish early. Paused: Resume in
 * Pause's place. Ended: nothing — a second Start would discard the attempt,
 * and a reached cap cannot be resumed. The lead control keeps its place
 * through every phase, so the button under a keyboard or a thumb stays the
 * same element and focus is not lost when its words change.
 */
function TimedWorkoutActions({ phase, startLabel, finishLabel: finish, onStart, onPause, onResume, onFinish,
  placement = 'after-work', leadRef }: TimedWorkoutActionsProps) {
  if (phase === 'ended') return null
  const ready = phase === 'ready'
  return <div className="clr-timed-actions" data-timed-actions={placement} data-timed-phase={phase}>
    <Button variant={ready ? 'primary' : 'secondary'} icon={ready || phase === 'paused' ? <Play /> : <Pause />}
      onClick={ready ? onStart : phase === 'paused' ? onResume : onPause} buttonRef={leadRef}>
      {ready ? startLabel : phase === 'paused' ? 'Resume' : 'Pause'}
    </Button>
    {!ready && <Button variant="primary" icon={<Stop />} onClick={onFinish}>{finish}</Button>}
  </div>
}
