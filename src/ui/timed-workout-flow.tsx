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
 * Neither Finish nor Undo completes or leaves the workout. In the gallery the
 * same attempt lives in memory only.
 */
import { use, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { Button, Check, Pause, Play, Stop } from '../design-system/index'
import { movementEntryBlank } from '../data/refinement-logging-rules'
import { useBlockCompletion, type BlockRecordedSource } from '../state/block-completion'
import { emomShape, emomView, minuteAssignment, scheduledMinuteFor, targetForMinute } from '../state/emom'
import { explicitLadderTiming, ladderRungs } from '../state/ladder'
import { ladderAttemptView, ladderRaceCapSeconds, type LadderDraft, type LadderDraftPatch } from '../state/ladder-recovery'
import { exerciseName, modalityLabel, targetText } from '../state/prescription'
import { distinctLoadText, equipmentName, loadText } from '../state/review'
import { SetLoggingContext } from '../state/set-logging'
import { activeSeconds, EMPTY_TIMED_ATTEMPT, moveTimedAttempt, timedAttemptFromClock, timedAttemptView, type TimedAttempt } from '../state/timed-attempt'
import { readTimedAttempt, recordTimedAction, writeTimedCounts } from '../state/timed-attempt-records'
import { finishLabel, type TimedLifecyclePhase } from '../state/timed-lifecycle'
import { defaultShellStorage, usePersistedLadder } from '../state/workout-persistence'
import { formatElapsed, spokenElapsed, useElapsedSeconds } from '../state/workout-clock'
import type { BlockProgress } from '../state/workout-progress'
import { LoggingOverlay } from './logging-overlay'
import { BlockPanel } from './block-renderers-frame'
import { GroupExerciseCoaching } from './exercise-coaching'
import { LadderPrescription } from './ladder-rungs'
import { MovementIdentity } from './movement-presentation'
import { TimerFrame } from './workout-chrome'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import { TimedResultLog, type TimedFormat, type TimedResultReceipt, type TimedResultDraft } from './timed-result-log'
import { initialTimedResultDraft, receiptFromRecorded, timedShellOutcome, timedShellReport, type TimedClockReading } from './timed-result-shell'
import { AmrapComparison } from './amrap-block'
import { SET_EFFORT_CHOICES } from './set-effort'
import { useCountdownUrgency } from './countdown-urgency'
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
  const [ownAttempt, setOwnAttempt] = useState<TimedAttempt>(restored?.attempt ?? EMPTY_TIMED_ATTEMPT)
  const attempt = isLadder ? timedAttemptFromClock(ladder.attempt.clock) : ownAttempt
  const [receipt, setReceipt] = useState<TimedResultReceipt | null>(null)
  const [resultDraft, setResultDraft] = useState<TimedResultDraft | null>(() => {
    const counts = restored?.counts
    if (!counts || (counts.roundsCompleted === null && counts.partialRoundReps === null)) return null
    return { ...initialTimedResultDraft('amrap', false, 0), count: counts.roundsCompleted, partialReps: counts.partialRoundReps }
  })
  const [editing, setEditing] = useState(false)
  // An attempt that had already ended before this mount does not reopen its log on arrival.
  const [logOpen, setLogOpen] = useState(() => {
    const kept = isLadder ? timedAttemptFromClock(ladder.attempt.clock) : restored?.attempt ?? null
    if (kept === null || kept.startedAt === null) return true
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
  /** The log's draft; an AMRAP's counts are kept on its record, as the shipped AMRAP kept them. */
  const changeDraft = (next: TimedResultDraft) => {
    setResultDraft(next)
    if (format === 'amrap') writeTimedCounts(storage, block, { roundsCompleted: next.count, partialRoundReps: next.partialReps ?? null })
  }
  const adjustedStart = attempt.startedAt === null ? null : new Date(attempt.startedAt + attempt.pausedMs).toISOString()
  // The hook re-renders the readout each second while the clock runs; the
  // reading itself is the attempt's at this render, so an Undo finish (which
  // brings back the same start) shows the attempt's own time at once rather
  // than the finished reading until the next tick (A3 TASK-105; AC-R014-03).
  useElapsedSeconds(adjustedStart, () => attempt.finishedAt ?? attempt.pausedAt ?? now())
  const elapsed = activeSeconds(attempt, now())
  const view = timedAttemptView(attempt, (attempt.startedAt ?? 0) + attempt.pausedMs + elapsed * 1000, cap)
  const ended = view.phase === 'finished' || view.phase === 'capped'
  const sheet = Boolean(presentation?.loggingOverlay) || options?.logPresentation === 'sheet'
  const clock: TimedClockReading = { started: view.phase !== 'ready', ended, elapsedSeconds: view.elapsed, capReached: view.phase === 'capped' }
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
    blockId: block.blockId, format, elapsedSeconds: view.elapsed, capReached: view.phase === 'capped', weightUnit,
    result: ladderView.authority === 'saved-here' ? logDraftOfLadder(ladderView.draft, false) : NOTHING_CLAIMED,
  }
  const saved = recorded !== null ? receiptFromRecorded(recorded, block, format, clock, weightUnit) : receipt ?? ladderSaved
  const showLog = (ended || ladderClosed) && (saved === null || editing)
  const shape = emomShape(block)
  const minute = emomView({ startedAt: adjustedStart, workDoneMinute: null }, shape, view.elapsed)
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
    : resultDraft ?? initialTimedResultDraft(format, view.phase === 'finished', rungs.length)
  const reported = saved !== null && !editing ? saved.result : draftNow
  const outcome = timedShellOutcome(format, block, reported, clock)
  const timed = timedShellReport(format, block, reported, saved?.weightUnit ?? weightUnit, ended, recorded)
  // A saved ladder is closed (TASK-048): no clock action, even one never started.
  const lifecycle: TimedLifecyclePhase = ladderClosed ? 'ended'
    : view.phase === 'ready' ? 'ready' : ended ? 'ended' : view.phase === 'paused' ? 'paused' : 'running'
  // A window the block prescribes can be ended early; a race, a ladder, or a window it does not prescribe is finished.
  const hasWindow = format === 'emom' ? shape.minutes !== null : cap !== null
  const actions = <TimedWorkoutActions phase={lifecycle} placement={format === 'ladder' ? 'top' : 'after-work'}
    startLabel={`Start ${format === 'ladder' ? 'ladder' : block.identity.label}`} finishLabel={finishLabel(format, hasWindow)}
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
    : format === 'emom' ? `Minute ${minute.minute} of ${shape.minutes ?? '—'}`
    : format === 'for_time' || format === 'ladder' ? 'Elapsed' : 'Remaining'
  const clockSeconds = format === 'emom' ? ended ? 0 : minute.secondsRemaining
    : format === 'amrap' ? view.remaining ?? view.elapsed : view.elapsed
  const urgency = useCountdownUrgency(view.phase === 'ready' || ended ? null : format === 'emom' ? minute.secondsRemaining : view.remaining, view.phase === 'running')
  const summary = format === 'ladder'
    ? `${rungs.length} rounds${cap === null ? '' : ` · ${formatElapsed(cap)} cap`}`
    : [block.identity.detail, block.identity.repScheme].filter(Boolean).join(' · ')
  const log = showLog && <TimedResultLog embedded={sheet} block={block} format={format} weightUnit={weightUnit}
    finished={view.phase === 'finished'} hierarchy={options?.logHierarchy} rungEmphasis={options?.rungEmphasis}
    completionAction={canUndoFinish ? <div className="clr-timed-undo" data-timed-undo="" style={UNDO_TEXT_START}>
      <Button type="button" variant="quiet" size="sm" onClick={undoFinish}>Undo finish · resume ladder</Button></div> : undefined}
    saveFailed={isLadder && !editing && ladderView.saveFailed}
    initial={saved?.result}
    value={isLadder ? (editing && resultDraft !== null ? resultDraft : ladderShown) : resultDraft ?? undefined}
    onDraftChange={isLadder && !editing ? ladderDraftChange : changeDraft} onSave={async result => {
      const saveResult = options?.saveResult
      if (!saveResult) throw new Error('No result adapter configured')
      const next: TimedResultReceipt = { blockId: block.blockId, format, result, weightUnit: saved?.weightUnit ?? weightUnit,
        elapsedSeconds: view.elapsed, capReached: view.phase === 'capped' }
      // A ladder's own save is kept on its attempt: refused, the draft and Undo stay for the retry; answered, the attempt closes.
      const durable = isLadder && !editing
      try {
        await saveResult(next, { block, shell: completion })
      } catch (error) {
        if (durable) saveFailed()
        throw error
      }
      if (durable) saveSucceeded()
      setReceipt(next); setEditing(false); setLogOpen(false)
    }} />

  // `data-urgent`: the deadline marker every shipped timed renderer carried, so
  // the shell's coordinated countdowns still find this one (A3 TASK-103).
  return <div className="clr-timed-flow" data-timed-format={format} data-phase={view.phase} data-cap-seconds={cap ?? undefined}
    data-counter-style={options?.counterStyle ?? 'wide'} data-urgent={urgency.urgent ? 'true' : 'false'}>
    {urgency.edge}
    <BlockPanel block={block} completion={{ outcome, timed }} timer={view.phase === 'ready' ? null :
      <div className="clr-timed-clock"><TimerFrame label={`${format === 'ladder' ? 'Ladder' : block.identity.label} time`} text={formatElapsed(clockSeconds)}
        spoken={`${caption}. ${spokenElapsed(clockSeconds)}`} caption={caption} size="var(--heading-h2-size)" fullWidth
        low={urgency.low || (view.phase === 'capped' && (format === 'for_time' || format === 'ladder'))} pulse={urgency.urgent ? urgency.loop : undefined} /></div>}>
      {block.exercises.length === 0 ? <BlockPanel.EmptyNote /> : <>
        <p className="clr-text-data-xs clr-timed-meta">{summary}</p>
        {format === 'ladder' && actions}
        {/* A ladder scheme with no sequence on any movement: the block is malformed, and saying so is its existing meaning. */}
        {format === 'ladder' && rungs.length === 0 && <BlockPanel.Note>This ladder prescribes no rungs — perform the movements as written.</BlockPanel.Note>}
        {format === 'ladder' ? <LadderPrescription exercises={block.exercises} weightUnit={weightUnit} rounds={timing?.rounds ?? null}
          completedThrough={ladderView.progress}
          onProgress={ladderView.canTrack && (view.phase === 'running' || view.phase === 'paused') ? ladder.track : undefined} /> : <BlockPanel.MovementList label={`Movements in this ${block.identity.label}`}>
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
        {earlyNote !== null && <p className="clr-timed-meta" data-timed-ended-early="">{earlyNote}</p>}
        {view.phase === 'running' && format === 'amrap' && <p className="clr-timed-meta">Log when complete</p>}
        {showLog && !sheet && <div ref={logHost}>{log}</div>}
        {showLog && sheet && <>
          <div className="clr-timed-actions"><Button variant="primary" onClick={() => setLogOpen(true)}>Log results</Button>
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
