import { Fragment, useState, type ReactNode } from 'react'
import { Button, ChoiceGroup, Input } from '../design-system/index'
import type { Enums } from '../data/database.types'
import { exerciseName, modalityLabel } from '../state/prescription'
import type { BlockProgress } from '../state/workout-progress'
import { ladderRungs, ladderUnit } from '../state/ladder'
import { QuantitySelector } from './quantity-selector'
import { Heading, HeadingSection } from './Heading'
import { LadderCompletion } from './ladder-rungs'
import { SetEffortChoice } from './set-effort'
import { useInvalidFocus } from './formFocus'
import { initialTimedResultDraft } from './timed-result-shell'
import '../styles/timed-workout.css'

export type TimedFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'
export interface TimedResultDraft {
  completed: boolean | null
  count: number | null
  /**
   * AMRAP: reps into the round the window closed on — the shipped AMRAP's
   * partial-round count, kept beside the per-movement amounts (owner decision
   * in the logging contract). Blank (`null`, or absent) is not recorded; 0 is.
   */
  partialReps?: number | null
  highestRung: number | null
  effort: Enums<'set_effort'> | null
  notes: string
  measurements: Record<string, { amount: string; weight: string }>
}

/** Review proposal's explicit receipt; no numeric-RPE conversion or backend claim. */
export interface TimedResultReceipt {
  blockId: string
  format: TimedFormat
  elapsedSeconds: number
  capReached: boolean
  result: TimedResultDraft
  weightUnit: Enums<'weight_unit'> | null
}

function ResultGroup({ title, children }: { title?: string; children: ReactNode }) {
  return <HeadingSection className="clr-timed-log__group">
    {title && <Heading className="clr-timed-log__group-title">{title}</Heading>}
    {children}
  </HeadingSection>
}

/** The log's words for a save that did not land (the accepted reference's, eded158c…). */
const TIMED_LOG_SAVE_FAILED = 'Your log didn’t save. Try again.'

/**
 * A3 TASK-105 (F3; TASK-048, AC-R032-01/03): `saveFailed` is a failure the
 * block keeps beyond this form — a ladder's durable attempt notes it, so it is
 * said again after a reload or a refused forward-action save — until a save
 * succeeds. The form's own failure (a Save log refused while it is open) is
 * said in the same words; either way there is one alert.
 */
export function TimedResultLog({ block, format, finished, weightUnit, onSave, initial,
  value, onDraftChange, completionAction, hierarchy = 'simple', rungEmphasis = 'reps', accessibleName = 'Log section results', embedded = false,
  saveFailed = false,
}: {
  block: BlockProgress; format: TimedFormat; finished: boolean; weightUnit: Enums<'weight_unit'> | null
  onSave: (result: TimedResultDraft) => Promise<void>; initial?: TimedResultDraft
  value?: TimedResultDraft; onDraftChange?: (next: TimedResultDraft) => void; completionAction?: ReactNode
  hierarchy?: 'simple' | 'grouped'; rungEmphasis?: 'round' | 'reps'; accessibleName?: string; embedded?: boolean
  saveFailed?: boolean
}) {
  const rungs = ladderRungs(block.exercises)
  const [localDraft, setLocalDraft] = useState<TimedResultDraft>(() => initial ?? initialTimedResultDraft(format, finished, rungs.length))
  const draft = value ?? localDraft
  const setDraft = (next: TimedResultDraft | ((current: TimedResultDraft) => TimedResultDraft)) => {
    const result = typeof next === 'function' ? next(draft) : next
    if (onDraftChange) onDraftChange(result); else setLocalDraft(result)
  }
  const onSubmit = useInvalidFocus()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const patch = (part: Partial<TimedResultDraft>) => setDraft(previous => ({ ...previous, ...part }))
  const field = (id: string, kind: 'amount' | 'weight', value: string) => setDraft(previous => ({
    ...previous, measurements: { ...previous.measurements, [id]: {
      amount: previous.measurements[id]?.amount ?? '', weight: previous.measurements[id]?.weight ?? '', [kind]: value,
    } },
  }))
  // A partial quantity belongs to a particular round. Preserve weights when
  // completion/progress changes, but never attach the old quantity to a new rung.
  const progress = (completed: boolean, highestRung: number | null) => setDraft(previous => ({
    ...previous, completed, highestRung,
    measurements: Object.fromEntries(Object.entries(previous.measurements)
      .map(([id, value]) => [id, { ...value, amount: '' }])),
  }))
  const nextRung = (draft.highestRung ?? 0) + 1
  // A3 TASK-105 (TASK-013/TASK-015, AC-R013-01/03): a ladder's partial work
  // belongs to the round after the stated prefix, so it is asked only once a
  // prefix is stated (zero included) and a round is left — nothing stated is
  // not round 0, and no field is offered for a round nobody named.
  const hasNextRung = nextRung <= rungs.length && (format !== 'ladder' || draft.highestRung !== null)
  // A3 TASK-105 (C33, AC-R013-02): the rung's unit is the ladder's shared
  // reading (`ladderUnit`), the same `reps` / `sec` / `m` its prescription grid
  // states — never a longer word than the round it names.
  const rungUnit = ladderUnit(block.exercises)
  const measurements = block.exercises.flatMap(exercise => {
    const p = exercise.prescription
    const loaded = p.equipment_used !== 'bodyweight' && p.load_type !== 'bodyweight' && p.equipment_used !== 'none'
    const amount = format === 'amrap' || (format === 'for_time' && !draft.completed)
      || (format === 'ladder' && !draft.completed && hasNextRung)
    if (!loaded && !amount) return []
    const name = exerciseName(p.exercise_id)
    const unit = modalityLabel(p)
    const target = format === 'ladder' ? p.target_sequence?.[nextRung - 1] ?? p.target_value : null
    return [<ResultGroup key={exercise.exerciseId} title={name}>
      {amount && <Input type="number" inputMode="numeric" min="0" step="1" max={target ?? undefined}
        label={format === 'amrap' ? 'Completed in next round' : format === 'ladder' ? `Completed in round ${nextRung}` : 'Completed'}
        aria-label={`${format === 'amrap' ? 'Next round' : format === 'ladder' ? `Round ${nextRung}` : 'Completed'} · ${name}`}
        unit={unit} value={draft.measurements[exercise.exerciseId]?.amount ?? ''}
        onChange={value => field(exercise.exerciseId, 'amount', value)} />}
      {loaded && <Input type="number" inputMode="decimal" min="0" step="any" label="Weight used" aria-label={`Weight · ${name}`}
        unit={weightUnit ?? undefined} value={draft.measurements[exercise.exerciseId]?.weight ?? ''}
        onChange={value => field(exercise.exerciseId, 'weight', value)} />}
    </ResultGroup>]
  })
  const Container = embedded ? Fragment : HeadingSection
  return <Container>
    <form className="clr-timed-log" data-log-hierarchy={hierarchy} aria-label={accessibleName} onSubmit={onSubmit(() => {
      if (saving) return false
      setSaving(true); setFailure(null)
      return onSave(draft).then(() => true, () => { setFailure(TIMED_LOG_SAVE_FAILED); return false }).finally(() => setSaving(false))
    })}>
      {!embedded && <Heading className="clr-timed-log__title">Log results</Heading>}
      <ResultGroup title={hierarchy === 'grouped' && format !== 'emom' ? 'Result' : undefined}>
        {(format === 'ladder' || format === 'for_time') && <ChoiceGroup className="clr-timed-completion" legend="Work completed"
          value={draft.completed ? 'complete' : 'partial'}
          options={[{ value: 'complete', label: 'Complete' }, { value: 'partial', label: 'Incomplete' }]}
          onChange={next => {
            const complete = next === 'complete'
            progress(complete, format === 'ladder' ? (complete ? rungs.length : null) : draft.highestRung)
          }} />}
        {completionAction}
        {format === 'amrap' && <QuantitySelector label="Rounds completed" value={draft.count} onChange={count => patch({ count })} />}
        {format === 'amrap' && <QuantitySelector label="Reps into the next round" value={draft.partialReps ?? null} onChange={partialReps => patch({ partialReps })} />}
        {format === 'ladder' && <LadderCompletion rungs={rungs} unit={rungUnit} completedThrough={draft.highestRung}
          emphasis={rungEmphasis} onChange={highestRung => progress(highestRung === rungs.length, highestRung)} />}
      </ResultGroup>
      {hierarchy === 'grouped' && measurements.length > 0
        ? <ResultGroup title="Movements">{measurements}</ResultGroup> : measurements}
      <ResultGroup title={hierarchy === 'grouped' ? 'Feedback' : undefined}>
        <SetEffortChoice scopeLabel="this section" legend="Effort · optional" value={draft.effort}
          onChange={effort => patch({ effort })} />
        <Input label="Notes · optional" multiline rows={2} value={draft.notes} onChange={notes => patch({ notes })} />
      </ResultGroup>
      {(failure !== null || saveFailed) && <p role="alert">{failure ?? TIMED_LOG_SAVE_FAILED}</p>}
      <div className="clr-timed-actions"><Button type="submit" variant="primary" loading={saving}>Save log</Button></div>
    </form>
  </Container>
}
