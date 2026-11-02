/** Isolated R4 proposal: shared presentation/clock, format-specific schedule/results. */
import { use, useEffect, useRef, useState } from 'react'
import { Button, Check, Pause, Play, Stop } from '../design-system/index'
import type { BlockOutcome } from '../state/block-completion'
import { emomShape, emomView, minuteAssignment, scheduledMinuteFor, targetForMinute } from '../state/emom'
import { explicitLadderTiming, ladderRungs } from '../state/ladder'
import { exerciseName, modalityLabel, targetText } from '../state/prescription'
import { distinctLoadText, equipmentName, loadText } from '../state/review'
import { SetLoggingContext } from '../state/set-logging'
import { EMPTY_TIMED_ATTEMPT, moveTimedAttempt, timedAttemptView } from '../state/timed-attempt'
import { formatElapsed, spokenElapsed, useElapsedSeconds } from '../state/workout-clock'
import type { BlockProgress } from '../state/workout-progress'
import { AppDialog } from './app-dialog'
import { BlockPanel } from './block-renderers-frame'
import { GroupExerciseCoaching } from './exercise-coaching'
import { MovementIdentity } from './movement-presentation'
import { TimerFrame } from './workout-chrome'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import { TimedResultLog, type TimedFormat, type TimedResultReceipt } from './timed-result-log'
import { SET_EFFORT_CHOICES } from './set-effort'
import { useInterfaceLoop } from './motion'
import '../styles/timed-workout.css'

export function TimedWorkoutFlow({ block, format }: { block: BlockProgress; format: TimedFormat }) {
  const presentation = useWorkoutExperiencePresentation()
  const options = presentation?.timedWorkflows
  const weightUnit = use(SetLoggingContext)?.weightUnit ?? null
  const [attempt, setAttempt] = useState(EMPTY_TIMED_ATTEMPT)
  const [receipt, setReceipt] = useState<TimedResultReceipt | null>(null)
  const [editing, setEditing] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  const logHost = useRef<HTMLDivElement>(null)
  const timing = explicitLadderTiming(block)
  const cap = timing?.mode === 'capped_window' ? timing.cap_seconds : block.timerSeconds
  const adjustedStart = attempt.startedAt === null ? null : new Date(attempt.startedAt + attempt.pausedMs).toISOString()
  const elapsed = useElapsedSeconds(adjustedStart, () => attempt.finishedAt ?? attempt.pausedAt ?? Date.now())
  const view = timedAttemptView(attempt, (attempt.startedAt ?? 0) + attempt.pausedMs + elapsed * 1000, cap)
  const ended = view.phase === 'finished' || view.phase === 'capped'
  const sheet = options?.logPresentation === 'sheet'
  const showLog = ended && (receipt === null || editing)
  const rungs = ladderRungs(block.exercises)
  const shape = emomShape(block)
  const minute = emomView({ startedAt: adjustedStart, workDoneMinute: null }, shape, view.elapsed)
  const action = (next: 'start' | 'pause' | 'resume' | 'finish') => setAttempt(current => moveTimedAttempt(current, next, Date.now()))

  useEffect(() => {
    if (showLog && !sheet) {
      const heading = logHost.current?.querySelector<HTMLElement>('h1,h2,h3,h4,h5,h6')
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); heading.scrollIntoView?.({ block: 'start' }) }
    }
  }, [showLog, sheet])

  const outcome: BlockOutcome = receipt === null ? {} : {
    elapsedSeconds: receipt.elapsedSeconds,
    ...(format === 'amrap' && receipt.result.count !== null ? { roundsCompleted: receipt.result.count } : {}),
    ...(format === 'emom' && receipt.result.count !== null ? { minutesCompleted: receipt.result.count } : {}),
    ...(format === 'ladder' && receipt.result.highestRung !== null ? { highestRung: receipt.result.highestRung } : {}),
    ...(format === 'for_time' || format === 'ladder' ? { completedUnderCap: receipt.result.completed === true && !receipt.capReached } : {}),
  }
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
  const urgent = view.phase === 'running' && (format === 'emom' ? minute.secondsRemaining <= 10 : view.remaining !== null && view.remaining <= 10)
  const pulse = useInterfaceLoop('urgent', urgent)
  const summary = format === 'ladder'
    ? `${rungs.length} rounds${cap === null ? '' : ` · ${formatElapsed(cap)} cap`}`
    : [block.identity.detail, block.identity.repScheme].filter(Boolean).join(' · ')
  const log = showLog && <TimedResultLog block={block} format={format} weightUnit={weightUnit}
    finished={view.phase === 'finished'} initial={receipt?.result} onSave={async result => {
      if (!options) throw new Error('No result adapter configured')
      const next: TimedResultReceipt = { blockId: block.blockId, format, result, weightUnit,
        elapsedSeconds: view.elapsed, capReached: view.phase === 'capped' }
      await options.saveResult(next)
      setReceipt(next); setEditing(false); setLogOpen(false)
    }} />

  return <div className="clr-timed-flow" data-timed-format={format} data-phase={view.phase} data-cap-seconds={cap ?? undefined}
    data-counter-style={options?.counterStyle ?? 'compact'}>
    <BlockPanel block={block} completion={{ outcome }} timer={view.phase === 'ready' ? null :
      <div className="clr-timed-clock"><TimerFrame label={`${block.identity.label} time`} text={formatElapsed(clockSeconds)}
        spoken={`${caption}. ${spokenElapsed(clockSeconds)}`} caption={caption} size="var(--heading-h2-size)" fullWidth
        low={urgent || (view.phase === 'capped' && (format === 'for_time' || format === 'ladder'))} pulse={pulse} /></div>}>
      {block.exercises.length === 0 ? <BlockPanel.EmptyNote /> : <>
        <p className="clr-text-data-xs clr-timed-meta">{summary}</p>
        {format === 'ladder' && actions}
        {format === 'ladder' ? <BlockPanel.MovementList label="Ladder rounds">
          {rungs.map((rung, index) => <BlockPanel.MovementItem key={rung.number}>
            <div className="clr-timed-rung"><p className="label">Round {rung.number}</p>
              {block.exercises.map(exercise => {
                const p = exercise.prescription
                const quantity = p.target_sequence?.[index] ?? p.target_value
                const load = p.load_type === null ? null : distinctLoadText(loadText(p.load_type, p.load_value, weightUnit), equipmentName(p.equipment_used))
                return <p key={exercise.exerciseId}>{quantity ?? '—'}{p.modality === 'reps' ? '' : ` ${modalityLabel(p)}`} × {exerciseName(p.exercise_id)}{load === null ? '' : ` · ${load}`}</p>
              })}
            </div>
          </BlockPanel.MovementItem>)}
        </BlockPanel.MovementList> : <BlockPanel.MovementList label={`Movements in this ${block.identity.label}`}>
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
          <div className="clr-timed-actions"><Button variant="primary" onClick={() => setLogOpen(true)}>Log results</Button></div>
          <AppDialog className="clr-timed-dialog" title="Section results" open={logOpen} onClose={() => setLogOpen(false)}
            actions={<Button variant="secondary" onClick={() => setLogOpen(false)}>Back to workout</Button>}>
            {log}
          </AppDialog>
        </>}
        {receipt !== null && !editing && <div className="clr-timed-log" data-timed-saved="">
          <div className="clr-timed-saved" role="status"><Check /><p>Log saved</p></div>
          <p className="clr-timed-meta">{formatElapsed(receipt.elapsedSeconds)} active time
            {receipt.result.count === null ? '' : ` · ${receipt.result.count} ${format === 'emom' ? 'minutes' : 'rounds'}`}
            {receipt.result.highestRung === null ? '' : ` · ${receipt.result.highestRung} rungs`}</p>
          {receipt.result.effort === null ? null : <p className="clr-timed-meta">Effort: {SET_EFFORT_CHOICES.find(o => o.value === receipt.result.effort)?.label}</p>}
          {block.exercises.map(exercise => {
            const value = receipt.result.measurements[exercise.exerciseId]
            if (!value || (value.amount === '' && value.weight === '')) return null
            return <p key={exercise.exerciseId} className="clr-timed-meta">{exerciseName(exercise.prescription.exercise_id)}
              {value.amount === '' ? '' : ` · ${value.amount} ${modalityLabel(exercise.prescription).toLowerCase()}`}
              {value.weight === '' ? '' : ` · ${value.weight} ${receipt.weightUnit ?? ''}`}</p>
          })}
          {receipt.result.notes.trim() === '' ? null : <p>{receipt.result.notes}</p>}
          <Button variant="secondary" onClick={() => { setEditing(true); setLogOpen(true) }}>Edit log</Button>
        </div>}
        {block.exercises.length === 1 && <GroupExerciseCoaching exercises={block.exercises} />}
      </>}
    </BlockPanel>
  </div>
}
