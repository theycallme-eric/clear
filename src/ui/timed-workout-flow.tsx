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
 */
import { use, useEffect, useRef, useState } from 'react'
import { Button, Check, Pause, Play, Stop } from '../design-system/index'
import { useBlockCompletion } from '../state/block-completion'
import { emomShape, emomView, minuteAssignment, scheduledMinuteFor, targetForMinute } from '../state/emom'
import { explicitLadderTiming, ladderRungs } from '../state/ladder'
import { exerciseName, modalityLabel, targetText } from '../state/prescription'
import { distinctLoadText, equipmentName, loadText } from '../state/review'
import { SetLoggingContext } from '../state/set-logging'
import { EMPTY_TIMED_ATTEMPT, moveTimedAttempt, timedAttemptView, type TimedAttempt } from '../state/timed-attempt'
import { readTimedAttempt, writeTimedAttempt, writeTimedCounts } from '../state/timed-attempt-records'
import { defaultShellStorage } from '../state/workout-persistence'
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

/** `now` defaults to the wall clock; the gallery passes its own to show capped and final-second states. */
export function TimedWorkoutFlow({ block, format, now = Date.now }: { block: BlockProgress; format: TimedFormat; now?: () => number }) {
  const presentation = useWorkoutExperiencePresentation()
  const options = presentation?.timedWorkflows
  const weightUnit = use(SetLoggingContext)?.weightUnit ?? null
  const completion = useBlockCompletion()
  const timing = explicitLadderTiming(block)
  const cap = timing?.mode === 'capped_window' ? timing.cap_seconds : block.timerSeconds
  // A3 TASK-103: the shell's session is what makes the attempt worth keeping;
  // a gallery or bare mount has none and stores nothing.
  const [storage] = useState(() => completion.sessionId === undefined ? null : defaultShellStorage())
  const [restored] = useState(() => readTimedAttempt(storage, format, block))
  const [attempt, setAttempt] = useState<TimedAttempt>(restored?.attempt ?? EMPTY_TIMED_ATTEMPT)
  const [receipt, setReceipt] = useState<TimedResultReceipt | null>(null)
  const [trackedRung, setTrackedRung] = useState<number | null>(null)
  const [resultDraft, setResultDraft] = useState<TimedResultDraft | null>(() => {
    const counts = restored?.counts
    if (!counts || (counts.roundsCompleted === null && counts.partialRoundReps === null)) return null
    return { ...initialTimedResultDraft('amrap', false, 0), count: counts.roundsCompleted, partialReps: counts.partialRoundReps }
  })
  const [undoAttempt, setUndoAttempt] = useState<typeof EMPTY_TIMED_ATTEMPT | null>(null)
  const [editing, setEditing] = useState(false)
  // An attempt that had already ended before this mount does not reopen its log on arrival.
  const [logOpen, setLogOpen] = useState(() => {
    if (restored === null) return true
    const phase = timedAttemptView(restored.attempt, now(), cap).phase
    return phase !== 'finished' && phase !== 'capped'
  })
  const logHost = useRef<HTMLDivElement>(null)
  /** The attempt, kept where the format's shipped renderer kept its clock. */
  const moveAttempt = (next: TimedAttempt) => {
    setAttempt(next)
    writeTimedAttempt(storage, format, block, next)
  }
  /** The log's draft; an AMRAP's counts are kept on its record, as the shipped AMRAP kept them. */
  const changeDraft = (next: TimedResultDraft) => {
    setResultDraft(next)
    if (format === 'amrap') writeTimedCounts(storage, block, { roundsCompleted: next.count, partialRoundReps: next.partialReps ?? null })
  }
  const adjustedStart = attempt.startedAt === null ? null : new Date(attempt.startedAt + attempt.pausedMs).toISOString()
  const elapsed = useElapsedSeconds(adjustedStart, () => attempt.finishedAt ?? attempt.pausedAt ?? now())
  const view = timedAttemptView(attempt, (attempt.startedAt ?? 0) + attempt.pausedMs + elapsed * 1000, cap)
  const ended = view.phase === 'finished' || view.phase === 'capped'
  const sheet = Boolean(presentation?.loggingOverlay) || options?.logPresentation === 'sheet'
  const rungs = ladderRungs(block.exercises)
  const clock: TimedClockReading = { started: view.phase !== 'ready', ended, elapsedSeconds: view.elapsed, capReached: view.phase === 'capped' }
  // TASK-048: once the shell holds the block's row (this device's save, or the
  // performed read after a reload), that row is the saved log shown.
  const recorded = ended ? completion.recordedResult?.(block.blockId) ?? null : null
  const saved = recorded === null ? receipt : receiptFromRecorded(recorded, block, format, clock, weightUnit)
  const showLog = ended && (saved === null || editing)
  const shape = emomShape(block)
  const minute = emomView({ startedAt: adjustedStart, workDoneMinute: null }, shape, view.elapsed)
  const ladderDraft = (): TimedResultDraft => ({ completed: trackedRung === rungs.length,
    count: null, highestRung: trackedRung, effort: null, notes: '', measurements: {} })
  const action = (next: 'start' | 'pause' | 'resume' | 'finish') => {
    if (next === 'finish') {
      if (format === 'ladder') {
        setUndoAttempt(attempt)
        setResultDraft(current => ({ ...(current ?? ladderDraft()), highestRung: trackedRung, completed: trackedRung === rungs.length }))
      }
      setLogOpen(true)
    }
    moveAttempt(moveTimedAttempt(attempt, next, now()))
  }
  const trackRung = (highestRung: number) => {
    setTrackedRung(highestRung)
    setResultDraft(current => current === null ? null : { ...current, highestRung,
      completed: highestRung === rungs.length,
      measurements: Object.fromEntries(Object.entries(current.measurements).map(([id, fields]) => [id, { ...fields, amount: '' }])) })
  }
  const undoFinish = () => {
    if (!undoAttempt) return
    setTrackedRung(resultDraft?.highestRung ?? trackedRung)
    moveAttempt(undoAttempt); setUndoAttempt(null); setLogOpen(true)
  }
  const canUndoFinish = format === 'ladder' && undoAttempt !== null && saved === null && view.phase === 'finished'


  useEffect(() => {
    if (showLog && !sheet) {
      const heading = logHost.current?.querySelector<HTMLElement>('h1,h2,h3,h4,h5,h6')
      if (heading) { heading.tabIndex = -1; heading.focus() }
    }
  }, [showLog, sheet])

  // What the block reports to the shell, in its format's existing contract: the
  // saved log, or else the draft so far — so the section's forward action saves
  // what the athlete entered even when Save log was never pressed (TASK-015).
  const draftNow = resultDraft ?? (format === 'ladder' ? ladderDraft() : initialTimedResultDraft(format, view.phase === 'finished', rungs.length))
  const reported = saved !== null && !editing ? saved.result : draftNow
  const outcome = timedShellOutcome(format, block, reported, clock)
  const timed = timedShellReport(format, block, reported, saved?.weightUnit ?? weightUnit, ended, recorded)
  const actions = !ended && <div className="clr-timed-actions">
    {view.phase === 'ready' ? <Button variant="primary" icon={<Play />} onClick={() => action('start')}>
      Start {format === 'ladder' ? 'ladder' : block.identity.label}
    </Button> : <>
      <Button variant="secondary" icon={view.phase === 'paused' ? <Play /> : <Pause />}
        onClick={() => action(view.phase === 'paused' ? 'resume' : 'pause')}>
        {view.phase === 'paused' ? 'Resume' : 'Pause'}
      </Button>
      <Button variant="primary" icon={<Stop />} onClick={() => action('finish')}>
        {format === 'amrap' || format === 'emom' ? 'Finish early' : 'Finish'}
      </Button>
    </>}
  </div>
  const caption = view.phase === 'paused' ? 'Paused' : view.phase === 'capped'
    ? format === 'for_time' || format === 'ladder' ? 'Cap reached' : 'Time complete'
    : view.phase === 'finished' ? 'Finished' : format === 'emom' ? `Minute ${minute.minute} of ${shape.minutes ?? '—'}`
    : format === 'for_time' || format === 'ladder' ? 'Elapsed' : 'Remaining'
  const clockSeconds = format === 'emom' ? ended ? 0 : minute.secondsRemaining
    : format === 'amrap' ? view.remaining ?? view.elapsed : view.elapsed
  const urgency = useCountdownUrgency(view.phase === 'ready' || ended ? null : format === 'emom' ? minute.secondsRemaining : view.remaining, view.phase === 'running')
  const summary = format === 'ladder'
    ? `${rungs.length} rounds${cap === null ? '' : ` · ${formatElapsed(cap)} cap`}`
    : [block.identity.detail, block.identity.repScheme].filter(Boolean).join(' · ')
  const log = showLog && <TimedResultLog embedded={sheet} block={block} format={format} weightUnit={weightUnit}
    finished={view.phase === 'finished'} hierarchy={options?.logHierarchy} rungEmphasis={options?.rungEmphasis}
    completionAction={canUndoFinish ? <div className="clr-timed-undo"><Button type="button" variant="quiet" size="sm" onClick={undoFinish}>Undo finish · resume ladder</Button></div> : undefined}
    initial={saved?.result} value={resultDraft ?? (format === 'ladder' ? ladderDraft() : undefined)} onDraftChange={changeDraft} onSave={async result => {
      const saveResult = options?.saveResult
      if (!saveResult) throw new Error('No result adapter configured')
      const next: TimedResultReceipt = { blockId: block.blockId, format, result, weightUnit: saved?.weightUnit ?? weightUnit,
        elapsedSeconds: view.elapsed, capReached: view.phase === 'capped' }
      await saveResult(next, { block, shell: completion })
      setReceipt(next); setEditing(false); setLogOpen(false); setUndoAttempt(null)
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
        {format === 'ladder' ? <LadderPrescription exercises={block.exercises} weightUnit={weightUnit} completedThrough={trackedRung}
          onProgress={view.phase === 'running' || view.phase === 'paused' ? trackRung : undefined} /> : <BlockPanel.MovementList label={`Movements in this ${block.identity.label}`}>
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
        {block.exercises.length === 1 && <GroupExerciseCoaching exercises={block.exercises} />}
      </>}
    </BlockPanel>
  </div>
}
